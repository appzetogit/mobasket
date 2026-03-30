// Sidebar menu structure for mofood (food delivery) - original unchanged
export const sidebarMenuData = [
  {
    type: "link",
    label: "All Platform Orders",
    path: "/admin/all-orders",
    icon: "FileText",
  },
  {
    type: "link",
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: "LayoutDashboard",
  },
  {
    type: "link",
    label: "Point of Sale",
    path: "/admin/point-of-sale",
    icon: "CreditCard",
  },
  {
    type: "section",
    label: "ADMIN MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Manage Admin",
        path: "/admin/manage-admin",
        icon: "UserCog",
      },
    ],
  },
  {
    type: "section",
    label: "FOOD MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Food Approval",
        path: "/admin/food-approval",
        icon: "CheckCircle2",
      },
      {
        type: "expandable",
        label: "Foods",
        icon: "Utensils",
        subItems: [
          { label: "Restaurant Foods List", path: "/admin/foods" },
          { label: "Menu", path: "/admin/food/menu" },
          { label: "Restaurant Addons List", path: "/admin/addons" },
        ],
      },
      {
        type: "expandable",
        label: "Categories",
        icon: "FolderTree",
        subItems: [
          { label: "Category", path: "/admin/categories" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "RESTAURANT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Zone Setup",
        path: "/admin/zone-setup",
        icon: "MapPin",
      },
      {
        type: "expandable",
        label: "Restaurants",
        icon: "UtensilsCrossed",
        subItems: [
          { label: "Restaurants List", path: "/admin/restaurants" },
          { label: "New Joining Request", path: "/admin/restaurants/joining-request" },
          { label: "Restaurant Commission", path: "/admin/restaurants/commission" },
          { label: "Restaurant Complaints", path: "/admin/restaurants/complaints" },
        ],
      },
    ],
  },

  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        subItems: [
          { label: "All", path: "/admin/orders/all" },
          { label: "Scheduled", path: "/admin/orders/scheduled" },
          { label: "Pending", path: "/admin/orders/pending" },
          { label: "Accepted", path: "/admin/orders/accepted" },
          { label: "Processing", path: "/admin/orders/processing" },
          { label: "Food On The Way", path: "/admin/orders/food-on-the-way" },
          { label: "Delivered", path: "/admin/orders/delivered" },
          { label: "Canceled", path: "/admin/orders/canceled" },
          { label: "Restaurant cancelled", path: "/admin/orders/restaurant-cancelled" },
          { label: "Payment Failed", path: "/admin/orders/payment-failed" },
          { label: "Refunded", path: "/admin/orders/refunded" },
          { label: "Offline Payments", path: "/admin/orders/offline-payments" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/order-detect-delivery",
        icon: "Truck",
      },
    ],
  },
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Restaurant Coupons & Offers",
        path: "/admin/coupons",
        icon: "Gift",
      },

      {
        type: "link",
        label: "Push Notification",
        path: "/admin/push-notification",
        icon: "Bell",
      },
    ],
  },

  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/customers",
        icon: "Users",
      },
    ],
  },
  {
    type: "section",
    label: "DELIVERYMAN MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          { label: "Delivery Cash Limit", path: "/admin/delivery-cash-limit" },
          { label: "Delivery & Platform Fee", path: "/admin/fee-settings" },
          { label: "Cash limit settlement", path: "/admin/cash-limit-settlement" },
          { label: "Delivery Withdrawal", path: "/admin/delivery-withdrawal" },
          { label: "Delivery boy Wallet", path: "/admin/delivery-boy-wallet" },
          { label: "Delivery Boy Commission", path: "/admin/delivery-boy-commission" },
          { label: "Delivery Emergency Help", path: "/admin/delivery-emergency-help" },
          { label: "Delivery Support Tickets", path: "/admin/delivery-support-tickets" },
          { label: "New Join Request", path: "/admin/delivery-partners/join-request" },
          { label: "Deliveryman List", path: "/admin/delivery-partners" },
          { label: "Deliveryman Reviews", path: "/admin/delivery-partners/reviews" },
          { label: "Bonus", path: "/admin/delivery-partners/bonus" },
          { label: "Earning Addon", path: "/admin/delivery-partners/earning-addon" },
          { label: "Earning Addon History", path: "/admin/delivery-partners/earning-addon-history" },
          { label: "Delivery Earning", path: "/admin/delivery-partners/earnings" },
        ],
      },
    ],
  },

  {
    type: "section",
    label: "HELP & SUPPORT",
    items: [
      {
        type: "link",
        label: "User Feedback",
        path: "/admin/contact-messages",
        icon: "Mail",
      },
      {
        type: "link",
        label: "Safety Emergency Reports",
        path: "/admin/safety-emergency-reports",
        icon: "AlertTriangle",
      },
    ],
  },

  {
    type: "section",
    label: "REPORT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Transaction Report",
        path: "/admin/transaction-report",
        icon: "FileText",
      },
      {
        type: "link",
        label: "Order Report",
        path: "/admin/order-report/regular",
        icon: "FileText",
      },
      {
        type: "link",
        label: "Restaurant Report",
        path: "/admin/restaurant-report",
        icon: "FileText",
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        subItems: [
          { label: "Feedback Experience", path: "/admin/customer-report/feedback-experience" },
        ],
      },

    ],
  },
  {
    type: "section",
    label: "TRANSACTION MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Restaurant Withdraws",
        path: "/admin/restaurant-withdraws",
        icon: "CreditCard",
      },
    ],
  },
  {
    type: "section",
    label: "BANNER SETTINGS",
    items: [
      {
        type: "link",
        label: "Landing Page Management",
        path: "/admin/hero-banner-management",
        icon: "Image",
      },
    ],
  },
  {
    type: "section",
    label: "BUSINESS SETTINGS",
    items: [
      {
        type: "link",
        label: "Business Setup",
        path: "/admin/business-setup",
        icon: "Settings",
      },
      {
        type: "expandable",
        label: "Pages & Social Media",
        icon: "Link",
        subItems: [
          { label: "Terms of Service", path: "/admin/pages-social-media/terms" },
          { label: "Privacy Policy", path: "/admin/pages-social-media/privacy" },
          { label: "About Us", path: "/admin/pages-social-media/about" },
          { label: "Refund Policy", path: "/admin/pages-social-media/refund" },
          { label: "Shipping Policy", path: "/admin/pages-social-media/shipping" },
          { label: "Cancellation Policy", path: "/admin/pages-social-media/cancellation" },

        ],
      },
    ],
  },

  {
    type: "section",
    label: "SYSTEM ENV",
    items: [
      {
        type: "link",
        label: "ENV Setup",
        path: "/admin/env-setup",
        icon: "Plus",
      },
    ],
  },
]

// Sidebar menu structure for mogrocery (grocery delivery) - similar structure with grocery-specific labels
export const mogroceryMenuData = [
  {
    type: "link",
    label: "All Platform Orders",
    path: "/admin/all-orders",
    icon: "FileText",
  },
  {
    type: "link",
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: "LayoutDashboard",
  },
  {
    type: "link",
    label: "Point of Sale",
    path: "/admin/point-of-sale",
    icon: "CreditCard",
  },
  {
    type: "section",
    label: "ADMIN MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Manage Admin",
        path: "/admin/manage-admin",
        icon: "UserCog",
      },
    ],
  },
  {
    type: "section",
    label: "GROCERY MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Grocery Approval",
        path: "/admin/grocery-product-approval",
        icon: "CheckCircle2",
      },
      {
        type: "link",
        label: "Categories",
        path: "/admin/grocery-categories",
        icon: "FolderTree",
      },
      {
        type: "link",
        label: "Subcategories",
        path: "/admin/grocery-subcategories",
        icon: "FolderTree",
      },
      {
        type: "link",
        label: "Products",
        path: "/admin/grocery-products-catalog",
        icon: "Package",
      },
      {
        type: "link",
        label: "Stock Management",
        path: "/admin/grocery-stock-management",
        icon: "Package",
      },
      {
        type: "link",
        label: "Product Addons List",
        path: "/admin/grocery-addons",
        icon: "Package",
      },
      {
        type: "link",
        label: "Plans",
        path: "/admin/grocery-plans",
        icon: "Calendar",
      },
    ],
  },
  {
    type: "section",
    label: "STORE MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Zone Setup",
        path: "/admin/zone-setup",
        icon: "MapPin",
      },
      {
        type: "expandable",
        label: "Stores",
        icon: "Building2",
        subItems: [
          { label: "Stores List", path: "/admin/grocery-stores" },
          { label: "Store Commission", path: "/admin/grocery-stores/commission" },
          { label: "New Joining Request", path: "/admin/grocery-stores/joining-request" },
          { label: "Store Withdraws", path: "/admin/grocery-store-withdraws" }
          // { label: "Store Complaints", path: "/admin/grocery-stores/complaints" },
        ],
      },
    ],
  },

  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        subItems: [
          { label: "All", path: "/admin/grocery-orders/all" },
          { label: "Scheduled", path: "/admin/grocery-orders/scheduled" },
          { label: "Pending", path: "/admin/grocery-orders/pending" },
          { label: "Accepted", path: "/admin/grocery-orders/accepted" },
          { label: "Processing", path: "/admin/grocery-orders/processing" },
          { label: "Grocery On The Way", path: "/admin/grocery-orders/on-the-way" },
          { label: "Delivered", path: "/admin/grocery-orders/delivered" },
          { label: "Canceled", path: "/admin/grocery-orders/canceled" },
          { label: "Store cancelled", path: "/admin/grocery-orders/store-cancelled" },
          { label: "Payment Failed", path: "/admin/grocery-orders/payment-failed" },
          { label: "Refunded", path: "/admin/grocery-orders/refunded" },
          { label: "Offline Payments", path: "/admin/grocery-orders/offline-payments" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/grocery-order-detect-delivery",
        icon: "Truck",
      },
    ],
  },
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Store Coupons & Offers",
        path: "/admin/grocery-coupons",
        icon: "Gift",
      },

      {
        type: "link",
        label: "Push Notification",
        path: "/admin/push-notification",
        icon: "Bell",
      },
    ],
  },

  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/customers",
        icon: "Users",
      },
    ],
  },
  {
    type: "section",
    label: "DELIVERYMAN MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          { label: "Delivery Cash Limit", path: "/admin/delivery-cash-limit" },
          { label: "Delivery & Platform Fee", path: "/admin/fee-settings" },
          { label: "Cash limit settlement", path: "/admin/cash-limit-settlement" },
          { label: "Delivery Withdrawal", path: "/admin/delivery-withdrawal" },
          { label: "Delivery boy Wallet", path: "/admin/delivery-boy-wallet" },
          { label: "Delivery Boy Commission", path: "/admin/delivery-boy-commission" },
          { label: "Delivery Emergency Help", path: "/admin/delivery-emergency-help" },
          { label: "Delivery Support Tickets", path: "/admin/delivery-support-tickets" },
          { label: "New Join Request", path: "/admin/delivery-partners/join-request" },
          { label: "Deliveryman List", path: "/admin/delivery-partners" },
          { label: "Deliveryman Reviews", path: "/admin/delivery-partners/reviews" },
          { label: "Bonus", path: "/admin/delivery-partners/bonus" },
          { label: "Earning Addon", path: "/admin/delivery-partners/earning-addon" },
          { label: "Earning Addon History", path: "/admin/delivery-partners/earning-addon-history" },
          { label: "Delivery Earning", path: "/admin/delivery-partners/earnings" },
        ],
      },
    ],
  },

  {
    type: "section",
    label: "HELP & SUPPORT",
    items: [
      {
        type: "link",
        label: "User Feedback",
        path: "/admin/contact-messages",
        icon: "Mail",
      },
      {
        type: "link",
        label: "Safety Emergency Reports",
        path: "/admin/safety-emergency-reports",
        icon: "AlertTriangle",
      },
    ],
  },

  {
    type: "section",
    label: "REPORT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Transaction Report",
        path: "/admin/transaction-report",
        icon: "FileText",
      },
      {
        type: "link",
        label: "Order Report",
        path: "/admin/grocery-order-report/regular",
        icon: "FileText",
      },
      {
        type: "link",
        label: "Store Report",
        path: "/admin/grocery-store-report",
        icon: "FileText",
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        subItems: [
          { label: "Feedback Experience", path: "/admin/customer-report/feedback-experience" },
        ],
      },

    ],
  },
  // {
  //   type: "section",
  //   label: "TRANSACTION MANAGEMENT",
  //   items: [
  //     // {
  //     //   type: "link",
  //     //   label: "Store Withdraws",
  //     //   path: "/admin/grocery-store-withdraws",
  //     //   icon: "CreditCard",
  //     // },
  //   ],
  // },
  {
    type: "section",
    label: "BANNER SETTINGS",
    items: [
      {
        type: "link",
        label: "Landing Page Management",
        path: "/admin/grocery-hero-banner-management",
        icon: "Image",
      },
      {
        type: "link",
        label: "Best Sellers",
        path: "/admin/product-sections-management",
        icon: "Megaphone",
      },
    ],
  },
  {
    type: "section",
    label: "BUSINESS SETTINGS",
    items: [
      {
        type: "link",
        label: "Business Setup",
        path: "/admin/business-setup",
        icon: "Settings",
      },
      {
        type: "expandable",
        label: "Pages & Social Media",
        icon: "Link",
        subItems: [
          { label: "Terms of Service", path: "/admin/pages-social-media/terms" },
          { label: "Privacy Policy", path: "/admin/pages-social-media/privacy" },
          { label: "About Us", path: "/admin/pages-social-media/about" },
          { label: "Refund Policy", path: "/admin/pages-social-media/refund" },
          { label: "Shipping Policy", path: "/admin/pages-social-media/shipping" },
          { label: "Cancellation Policy", path: "/admin/pages-social-media/cancellation" },

        ],
      },
    ],
  },

  {
    type: "section",
    label: "SYSTEM ENV",
    items: [
      {
        type: "link",
        label: "ENV Setup",
        path: "/admin/env-setup",
        icon: "Plus",
      },
    ],
  },
]

// Export mofoodMenuData as alias to sidebarMenuData for consistency
export const mofoodMenuData = sidebarMenuData
