import axios from "axios";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";

/**
 * Creates an Axios instance with standard GitHub API headers
 * @param {string} accessToken - GitHub OAuth access token
 * @returns {AxiosInstance}
 */
const createGitHubClient = (accessToken) => {
    return axios.create({
        baseURL: GITHUB_API_BASE_URL,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "SEIS-AI-Backend",
        },
        timeout: 15000,
    });
};

/**
 * Handles errors from GitHub API requests and throws descriptive errors
 * @param {Error} error - Axios error object
 * @param {string} context - Action description for context
 */
const handleGitHubError = (error, context = "GitHub API operation") => {
    if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.message;

        if (status === 401) {
            const err = new Error(`GitHub Authentication failed: ${message}`);
            err.statusCode = 401;
            throw err;
        }

        if (status === 403) {
            const rateLimitRemaining = error.response.headers["x-ratelimit-remaining"];
            if (rateLimitRemaining === "0") {
                const resetTime = new Date(Number(error.response.headers["x-ratelimit-reset"]) * 1000);
                const err = new Error(`GitHub rate limit exceeded. Resets at ${resetTime.toISOString()}`);
                err.statusCode = 429;
                throw err;
            }
            const err = new Error(`GitHub Forbidden: ${message}`);
            err.statusCode = 403;
            throw err;
        }

        if (status === 404) {
            const err = new Error(`GitHub resource not found (${context}): ${message}`);
            err.statusCode = 404;
            throw err;
        }

        if (status === 422) {
            const err = new Error(`GitHub Unprocessable Entity (${context}): ${message}`);
            err.statusCode = 422;
            throw err;
        }

        const err = new Error(`GitHub error (${status}) during ${context}: ${message}`);
        err.statusCode = status;
        throw err;
    }

    if (error.code === "ECONNABORTED") {
        const err = new Error(`GitHub API request timed out during ${context}`);
        err.statusCode = 504;
        throw err;
    }

    const err = new Error(`Network error during ${context}: ${error.message}`);
    err.statusCode = 502;
    throw err;
};

/**
 * Exchange OAuth authorization code for GitHub access token
 * @param {string} code - GitHub authorization code
 * @returns {Promise<string>} Access token
 */
export const exchangeCodeForToken = async (code) => {
    try {
        const response = await axios.post(
            GITHUB_OAUTH_TOKEN_URL,
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: process.env.GITHUB_CALLBACK_URL,
            },
            {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "SEIS-AI-Backend",
                },
                timeout: 10000,
            }
        );

        if (response.data.error) {
            const error = new Error(`OAuth error: ${response.data.error_description || response.data.error}`);
            error.statusCode = 400;
            throw error;
        }

        return response.data.access_token;
    } catch (error) {
        if (error.statusCode) throw error;
        handleGitHubError(error, "exchangeCodeForToken");
    }
};

/**
 * Fetch authenticated GitHub user details and primary email
 * @param {string} accessToken - GitHub access token
 * @returns {Promise<object>} User profile
 */
export const getAuthenticatedUser = async (accessToken) => {
    try {
        const client = createGitHubClient(accessToken);
        const { data: user } = await client.get("/user");

        // If email is private/null in public profile, fetch primary verified email from /user/emails
        let email = user.email;
        if (!email) {
            try {
                const { data: emails } = await client.get("/user/emails");
                const primaryEmailObj = emails.find((e) => e.primary && e.verified) || emails[0];
                if (primaryEmailObj) {
                    email = primaryEmailObj.email;
                }
            } catch (emailErr) {
                // Non-fatal if emails endpoint fails or scope is restricted
                console.warn("Could not fetch user emails from GitHub /user/emails:", emailErr.message);
            }
        }

        return {
            githubId: String(user.id),
            githubUsername: user.login,
            name: user.name || user.login,
            email: email || null,
            avatarUrl: user.avatar_url,
            bio: user.bio || null,
            company: user.company || null,
            location: user.location || null,
            blog: user.blog || null,
            twitterUsername: user.twitter_username || null,
            githubProfileUrl: user.html_url,
            publicRepos: user.public_repos || 0,
            publicGists: user.public_gists || 0,
            followers: user.followers || 0,
            following: user.following || 0,
            githubCreatedAt: user.created_at ? new Date(user.created_at) : null,
        };
    } catch (error) {
        handleGitHubError(error, "getAuthenticatedUser");
    }
};

/**
 * Fetch all repositories accessible to the user
 * @param {string} accessToken - GitHub access token
 * @param {object} options - Pagination and filtering options
 * @returns {Promise<Array>} List of repositories
 */
export const getUserRepositories = async (accessToken, { page = 1, perPage = 100, visibility = "all", sort = "updated" } = {}) => {
    try {
        const client = createGitHubClient(accessToken);
        const { data } = await client.get("/user/repos", {
            params: {
                page,
                per_page: perPage,
                visibility,
                sort,
                direction: "desc",
                affiliation: "owner,collaborator,organization_member",
            },
        });
        return data;
    } catch (error) {
        handleGitHubError(error, "getUserRepositories");
    }
};

/**
 * Fetch all branches of a repository
 * @param {string} accessToken - GitHub access token
 * @param {string} owner - Repository owner login
 * @param {string} repo - Repository name
 * @param {object} options - Pagination options
 * @returns {Promise<Array>} List of branches
 */
export const getRepositoryBranches = async (accessToken, owner, repo, { page = 1, perPage = 100 } = {}) => {
    try {
        const client = createGitHubClient(accessToken);
        const { data } = await client.get(`/repos/${owner}/${repo}/branches`, {
            params: {
                page,
                per_page: perPage,
            },
        });
        return data;
    } catch (error) {
        handleGitHubError(error, `getRepositoryBranches for ${owner}/${repo}`);
    }
};

/**
 * Fetch commits for a specific branch or commit SHA
 * @param {string} accessToken - GitHub access token
 * @param {string} owner - Repository owner login
 * @param {string} repo - Repository name
 * @param {object} options - Options including branch name or SHA, pagination
 * @returns {Promise<Array>} List of commits
 */
export const getBranchCommits = async (accessToken, owner, repo, { sha, page = 1, perPage = 30 } = {}) => {
    try {
        const client = createGitHubClient(accessToken);
        const params = {
            page,
            per_page: perPage,
        };
        if (sha) {
            params.sha = sha;
        }

        const { data } = await client.get(`/repos/${owner}/${repo}/commits`, { params });
        return data;
    } catch (error) {
        handleGitHubError(error, `getBranchCommits for ${owner}/${repo}`);
    }
};

/**
 * Fetch single commit detail (including additions, deletions, changed files)
 * @param {string} accessToken - GitHub access token
 * @param {string} owner - Repository owner login
 * @param {string} repo - Repository name
 * @param {string} commitSha - Commit SHA
 * @returns {Promise<object>} Detailed commit object
 */
export const getCommitDetail = async (accessToken, owner, repo, commitSha) => {
    try {
        const client = createGitHubClient(accessToken);
        const { data } = await client.get(`/repos/${owner}/${repo}/commits/${commitSha}`);
        return data;
    } catch (error) {
        handleGitHubError(error, `getCommitDetail for ${owner}/${repo} commit ${commitSha}`);
    }
};

/**
 * Fetch repository Git tree metadata recursively
 * @param {string} accessToken - GitHub access token
 * @param {string} owner - Repository owner login
 * @param {string} repo - Repository name
 * @param {string} treeSha - Commit SHA or Branch Name or Tree SHA
 * @param {object} options - Recursive flag
 * @returns {Promise<object>} Tree object { sha, tree, truncated }
 */
export const getRepositoryTree = async (accessToken, owner, repo, treeSha, { recursive = true } = {}) => {
    try {
        const client = createGitHubClient(accessToken);
        const params = {};
        if (recursive) {
            params.recursive = 1;
        }

        const { data } = await client.get(`/repos/${owner}/${repo}/git/trees/${treeSha}`, { params });
        return data;
    } catch (error) {
        handleGitHubError(error, `getRepositoryTree for ${owner}/${repo} at ${treeSha}`);
    }
};

/**
 * Fetch individual file content from a repository
 * @param {string} accessToken - GitHub access token
 * @param {string} owner - Repository owner login
 * @param {string} repo - Repository name
 * @param {string} path - File path in repository
 * @param {string} ref - Branch name or commit SHA
 * @returns {Promise<object>} File content details { name, path, sha, size, content, encoding }
 */
export const getFileContent = async (accessToken, owner, repo, path, ref) => {
    try {
        const client = createGitHubClient(accessToken);
        const params = {};
        if (ref) {
            params.ref = ref;
        }

        const { data } = await client.get(`/repos/${owner}/${repo}/contents/${path}`, { params });
        
        // Handle if directory was requested instead of a file
        if (Array.isArray(data)) {
            const err = new Error(`Path '${path}' is a directory, not a file.`);
            err.statusCode = 400;
            throw err;
        }

        let decodedContent = null;
        if (data.content && data.encoding === "base64") {
            decodedContent = Buffer.from(data.content, "base64").toString("utf-8");
        }

        return {
            name: data.name,
            path: data.path,
            sha: data.sha,
            size: data.size,
            htmlUrl: data.html_url,
            downloadUrl: data.download_url,
            type: data.type,
            encoding: data.encoding,
            content: decodedContent,
        };
    } catch (error) {
        if (error.statusCode) throw error;
        handleGitHubError(error, `getFileContent for ${owner}/${repo} path ${path}`);
    }
};
