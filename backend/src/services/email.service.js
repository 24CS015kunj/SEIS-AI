import nodemailer from "nodemailer";

/**
 * Creates and configures the Nodemailer SMTP transporter
 * @returns {nodemailer.Transporter|null}
 */
const getTransporter = () => {
    const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD } = process.env;

    // If SMTP host or user is not configured, return null
    if (!MAIL_HOST || !MAIL_USER) {
        return null;
    }

    return nodemailer.createTransport({
        host: MAIL_HOST,
        port: Number(MAIL_PORT) || 587,
        secure: Number(MAIL_PORT) === 465,
        auth: {
            user: MAIL_USER,
            pass: MAIL_PASSWORD,
        },
    });
};

/**
 * Send an email using Nodemailer
 * Fails gracefully without throwing unhandled exceptions to avoid breaking user flows
 * @param {object} options - Email parameters { to, subject, html, text }
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export const sendEmail = async ({ to, subject, html, text }) => {
    try {
        if (!to) {
            console.warn("[EmailService] No recipient email address provided. Skipping email.");
            return { success: false, error: "Recipient email is missing." };
        }

        const transporter = getTransporter();
        if (!transporter) {
            console.warn("[EmailService] SMTP credentials not configured. Email skipped.");
            return { success: false, error: "SMTP not configured." };
        }

        const fromAddress = process.env.MAIL_FROM || `"SEIS-AI" <no-reply@seis-ai.local>`;

        const info = await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            text,
            html,
        });

        console.log(`[EmailService] Email sent successfully to ${to} (MessageId: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        // Log safe message without exposing credentials
        console.error(`[EmailService] Failed to send email to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send a welcome email on initial user registration
 * @param {string} userEmail - User's email address
 * @param {string} userName - User's display name or username
 * @returns {Promise<object>}
 */
export const sendWelcomeEmail = async (userEmail, userName) => {
    const displayName = userName || "Developer";
    const subject = "Welcome to SEIS-AI - Production Project Tracker";
    
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
            <div style="background-color: #0f172a; padding: 20px; border-radius: 6px; text-align: center; margin-bottom: 24px;">
                <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">SEIS-AI</h1>
                <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 14px;">Next-Generation Project Tracker & Intelligence Platform</p>
            </div>
            
            <div style="background-color: #ffffff; padding: 24px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; margin-top: 0;">Welcome, ${displayName}! 👋</h2>
                <p style="line-height: 1.6; color: #475569;">
                    Your GitHub account has been successfully connected to <strong>SEIS-AI</strong>.
                </p>
                <p style="line-height: 1.6; color: #475569;">
                    With SEIS-AI, you can seamlessly synchronize your repositories, track branches, analyze commit histories, and monitor your software projects in real-time.
                </p>
                <div style="margin: 24px 0; text-align: center;">
                    <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                        Open SEIS-AI Dashboard
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">
                    If you did not initiate this login, please revoke access from your GitHub account settings.
                </p>
            </div>
        </div>
    `;

    const text = `Welcome to SEIS-AI, ${displayName}!\n\nYour GitHub account has been successfully connected. Visit ${process.env.FRONTEND_URL || "http://localhost:5173"} to get started.`;

    return sendEmail({ to: userEmail, subject, html, text });
};

/**
 * Send a summary email after repository synchronization
 * @param {string} userEmail - User's email address
 * @param {object} stats - Synchronization statistics { repositoryCount, repositoriesUpdated, branchesCount, commitsCount, filesCount }
 * @returns {Promise<object>}
 */
export const sendRepositorySyncEmail = async (userEmail, stats = {}) => {
    const subject = "SEIS-AI Repository Synchronization Summary";
    const repoCount = stats.repositoryCount || stats.repositoriesUpdated || 0;
    const branchesCount = stats.branchesCount || 0;
    const commitsCount = stats.commitsCount || 0;
    const filesCount = stats.filesCount || 0;

    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
            <div style="background-color: #0f172a; padding: 20px; border-radius: 6px; text-align: center; margin-bottom: 24px;">
                <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 700;">SEIS-AI Repository Sync</h1>
                <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 14px;">Synchronization Report</p>
            </div>
            
            <div style="background-color: #ffffff; padding: 24px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">Sync Completed Successfully ✅</h2>
                <p style="color: #475569; margin-bottom: 20px;">Here is the summary of your latest GitHub synchronization:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Repositories Synced</td>
                        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${repoCount}</td>
                    </tr>
                    ${branchesCount > 0 ? `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Branches Updated</td>
                        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${branchesCount}</td>
                    </tr>` : ""}
                    ${commitsCount > 0 ? `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Commits Processed</td>
                        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${commitsCount}</td>
                    </tr>` : ""}
                    ${filesCount > 0 ? `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Files Cataloged</td>
                        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${filesCount}</td>
                    </tr>` : ""}
                </table>
                
                <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 4px; margin-top: 16px;">
                    <p style="color: #166534; margin: 0; font-size: 14px; font-weight: 500;">All data is up to date and ready for exploration in your dashboard.</p>
                </div>
            </div>
        </div>
    `;

    const text = `SEIS-AI Repository Sync Summary\n\nRepositories: ${repoCount}\nBranches: ${branchesCount}\nCommits: ${commitsCount}\nFiles: ${filesCount}\n\nSync completed successfully.`;

    return sendEmail({ to: userEmail, subject, html, text });
};
