/**
 * Builds the clean target path when switching repositories.
 * Preserves the current page section (/command-center, /architecture, /source-control, /software-evolution),
 * and safely strips ?file= query parameter if switching on Architecture view (Task 80/81).
 *
 * @param {string} pathname - current location.pathname
 * @param {string} targetRepoId - MongoDB _id of the target repository
 * @returns {string} clean target path
 */
export function buildRepositorySwitchPath(pathname, targetRepoId) {
  const sections = ['/command-center', '/architecture', '/source-control', '/software-evolution'];
  const matchedSection = sections.find((s) => pathname === s || pathname.startsWith(`${s}/`));
  const baseSection = matchedSection || '/command-center';
  return targetRepoId ? `${baseSection}/${targetRepoId}` : baseSection;
}
