/**
 * Role hierarchy:
 *   admin  → can do everything
 *   editor → can create/edit/import, cannot manage users
 *   viewer → read-only, can export
 */

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
        yourRole: req.user.role,
      });
    }

    next();
  };
};

export const adminOnly  = requireRole("admin");
export const editorPlus = requireRole("admin", "editor");
export const viewerPlus = requireRole("admin", "editor", "viewer");

export default { requireRole, adminOnly, editorPlus, viewerPlus };
