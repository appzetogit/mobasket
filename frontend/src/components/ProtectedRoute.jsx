import { Navigate, useLocation } from "react-router-dom";
import { isModuleAuthenticated } from "@/lib/utils/auth";

const hasProvisionedPartnerProfile = (user) => {
  if (!user || typeof user !== "object") return false;
  if (user.isActive === true) return true;

  const normalizedStatus = String(user.status || "").trim().toLowerCase();
  if (normalizedStatus && normalizedStatus !== "onboarding") return true;

  if (user.approvedAt || user.rejectedAt || String(user.rejectionReason || "").trim()) {
    return true;
  }

  if (Number(user?.onboarding?.completedSteps || 0) >= 4) {
    return true;
  }

  const hasBasicInfo = Boolean(
    user.name &&
    user.ownerName &&
    user.ownerEmail &&
    (user.ownerPhone || user.phone || user.primaryContactNumber),
  );
  const hasLocation = Boolean(user.location?.area || user.location?.city);
  const hasCatalogSignals = Boolean(
    (Array.isArray(user.cuisines) && user.cuisines.length > 0) ||
    (Array.isArray(user.menuImages) && user.menuImages.length > 0) ||
    user.profileImage,
  );

  return hasBasicInfo && hasLocation && hasCatalogSignals;
};

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath, module }) {
  const location = useLocation();

  // Determine the module to check based on route path or explicit module prop
  let moduleToCheck = module;
  if (!moduleToCheck && location.pathname.startsWith('/store')) {
    moduleToCheck = 'grocery-store';
  } else if (!moduleToCheck && requiredRole) {
    // Map role to module for backward compatibility
    const roleModuleMap = {
      'admin': 'admin',
      'restaurant': 'restaurant',
      'delivery': 'delivery',
      'user': 'user',
      'grocery-store': 'grocery-store'
    };
    moduleToCheck = roleModuleMap[requiredRole] || requiredRole;
  }

  // Check if user is authenticated for the required module using module-specific token
  if (!moduleToCheck) {
    // If no module/role required, allow access
    return children;
  }

  const isAuthenticated = isModuleAuthenticated(moduleToCheck);

  // If authenticated as delivery, check if signup is complete
  if (isAuthenticated && moduleToCheck === 'delivery') {
    const rawUser = localStorage.getItem('delivery_user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    const needsSignup = localStorage.getItem('delivery_needsSignup') === 'true';
    const normalizedStatus = String(user?.status || '').trim().toLowerCase();
    const isPendingPage = location.pathname === '/delivery/pending-approval';
    const isSignupOrAuthPage = location.pathname.startsWith('/delivery/signup/') ||
      location.pathname === '/delivery/otp' ||
      location.pathname === '/delivery/sign-in';

    // Redirect to signup only while the profile is actually in onboarding.
    // This prevents stale `delivery_needsSignup=true` from causing redirect loops
    // after onboarding is already submitted.
    if (user && needsSignup && normalizedStatus === 'onboarding') {
      if (!isSignupOrAuthPage) {
        return <Navigate to="/delivery/signup/details" replace />;
      }
    }

    if (user) {
      const isActiveApproved = user.isActive === true || normalizedStatus === 'active' || normalizedStatus === 'approved';
      const pendingLikeStatuses = new Set([
        'pending',
        'rejected',
        'declined',
        'blocked',
        'submitted',
        'verification_pending',
        'in_review',
        'under_review',
      ]);

      if (!isActiveApproved && pendingLikeStatuses.has(normalizedStatus)) {
        if (!isPendingPage && !isSignupOrAuthPage) {
          return <Navigate to="/delivery/pending-approval" replace />;
        }
      } else if (isPendingPage && isActiveApproved) {
        return <Navigate to="/delivery" replace />;
      }
    }
  }

  // If authenticated as restaurant or grocery-store, check status
  if (isAuthenticated && (moduleToCheck === 'restaurant' || moduleToCheck === 'grocery-store')) {
    const modulePrefix = moduleToCheck === 'restaurant' ? 'restaurant' : 'store';
    const rawUser = localStorage.getItem(`${moduleToCheck}_user`);
    const user = rawUser ? JSON.parse(rawUser) : null;

    if (user) {
      const normalizedStatus = String(user.status || '').trim().toLowerCase();
      const completedOnboardingSteps = Number(user?.onboarding?.completedSteps || 0);
      const isApprovedAndActive =
        user.isActive === true ||
        Boolean(user?.approvedAt) ||
        normalizedStatus === 'active' ||
        normalizedStatus === 'approved';
      const isOnboardingPage = location.pathname.startsWith(`/${modulePrefix}/onboarding`) ||
        location.pathname.includes('/otp') ||
        location.pathname.includes('/login');
      const isPendingPage = location.pathname === `/${modulePrefix}/pending-approval`;
      const isAuthPage = location.pathname.includes('/login') || location.pathname.includes('/otp');
      const pendingLikeStatuses = new Set([
        'pending',
        'rejected',
        'declined',
        'submitted',
        'verification_pending',
        'in_review',
        'under_review',
      ]);
      const shouldStayOnPendingApproval =
        !isApprovedAndActive &&
        pendingLikeStatuses.has(normalizedStatus);

      if (shouldStayOnPendingApproval) {
        if (!isPendingPage && !isAuthPage) {
          return <Navigate to={`/${modulePrefix}/pending-approval`} replace />;
        }
      }

      // Handle onboarding status
      if (!isApprovedAndActive && normalizedStatus === 'onboarding') {
        if (completedOnboardingSteps >= 4 || hasProvisionedPartnerProfile(user)) {
          // Let onboarding-complete accounts render and self-resolve with fresh backend
          // state instead of forcing a pending redirect from possibly stale cached auth data.
        }
        // Allow both onboarding and pending pages to render so they can self-resolve
        // using fresh backend state, instead of bouncing due to stale localStorage status.
        else if (!isOnboardingPage && !isPendingPage && !isAuthPage) {
          return <Navigate to={`/${modulePrefix}/onboarding`} replace />;
        }
      }
      // Handle pending status
      else if (!isApprovedAndActive && normalizedStatus === 'pending') {
        // Allow onboarding route too to avoid ping-pong loops when local storage status
        // is stale and backend returns onboarding for this account.
        if (!isPendingPage && !isOnboardingPage && !isAuthPage) {
          return <Navigate to={`/${modulePrefix}/pending-approval`} replace />;
        }
      }
    }
  }

  // If not authenticated for this module, redirect to login
  if (!isAuthenticated) {
    if (loginPath) {
      return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
    }

    // Fallback: redirect to appropriate login page
    const roleLoginPaths = {
      'admin': '/admin/login',
      'restaurant': '/restaurant/login',
      'delivery': '/delivery/sign-in',
      'user': '/user/auth/sign-in',
      'grocery-store': '/store/login'
    };

    const redirectPath = roleLoginPaths[moduleToCheck] || roleLoginPaths[requiredRole] || '/';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
}

