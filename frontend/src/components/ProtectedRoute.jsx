import { Navigate, useLocation } from "react-router-dom";
import { isModuleAuthenticated } from "@/lib/utils/auth";

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

    // If status is onboarding, and not already on a signup page, redirect to signup details
    if (user && user.status === 'onboarding') {
      const isSignupPage = location.pathname.startsWith('/delivery/signup/') ||
        location.pathname === '/delivery/otp' ||
        location.pathname === '/delivery/sign-in';

      if (!isSignupPage) {
        return <Navigate to="/delivery/signup/details" replace />;
      }
    }
  }

  // If authenticated as restaurant or grocery-store, check status
  if (isAuthenticated && (moduleToCheck === 'restaurant' || moduleToCheck === 'grocery-store')) {
    const modulePrefix = moduleToCheck === 'restaurant' ? 'restaurant' : 'store';
    const rawUser = localStorage.getItem(`${moduleToCheck}_user`);
    const user = rawUser ? JSON.parse(rawUser) : null;

    if (user) {
      // Handle onboarding status
      if (user.status === 'onboarding') {
        const isOnboardingPage = location.pathname.startsWith(`/${modulePrefix}/onboarding`) ||
          location.pathname.includes('/otp') ||
          location.pathname.includes('/login');

        if (!isOnboardingPage) {
          return <Navigate to={`/${modulePrefix}/onboarding`} replace />;
        }
      }
      // Handle pending status
      else if (user.status === 'pending') {
        const isPendingPage = location.pathname === `/${modulePrefix}/pending-approval`;
        const isAuthPage = location.pathname.includes('/login') || location.pathname.includes('/otp');

        if (!isPendingPage && !isAuthPage) {
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

