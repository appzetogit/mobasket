export const requestBrowserNotificationPermission = () => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }

  if (Notification.permission !== 'default') {
    return;
  }

  const requestPermission = () => {
    Notification.requestPermission().catch(() => {});
    document.removeEventListener('click', requestPermission);
    document.removeEventListener('touchstart', requestPermission);
    document.removeEventListener('keydown', requestPermission);
  };

  document.addEventListener('click', requestPermission, { once: true });
  document.addEventListener('touchstart', requestPermission, { once: true });
  document.addEventListener('keydown', requestPermission, { once: true });
};

export const showBrowserNotification = ({ title, body, tag }) => {
  if (
    typeof window === 'undefined' ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  ) {
    return null;
  }

  try {
    return new Notification(title, {
      body,
      tag,
      silent: false,
      requireInteraction: true,
    });
  } catch {
    return null;
  }
};
