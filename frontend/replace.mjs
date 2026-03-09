import fs from 'fs';
const filePath = 'c:\\\\Users\\\\Ishaa\\\\Desktop\\\\CompanyProjects\\\\mobasket\\\\frontend\\\\src\\\\module\\\\restaurant\\\\pages\\\\OutletInfo.jsx';
let content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');

const target1 = `          {/* Reviews Section - Left Aligned */}
          <div className="flex flex-col gap-2">
            {/* Delivery Reviews */}`;

const repl1 = `          {/* Reviews Section - Left Aligned */}
          {!isGroceryStoreRoute && (
          <div className="flex flex-col gap-2">
            {/* Delivery Reviews */}`;

const target2 = `              <span className="text-gray-800 text-sm font-normal">NOT ENOUGH DINING REVIEWS</span>
            </div>
          </div>
        </div>
      </div>`;

const repl2 = `              <span className="text-gray-800 text-sm font-normal">NOT ENOUGH DINING REVIEWS</span>
            </div>
          </div>
          )}
        </div>
      </div>`;

const target3 = `      {/* Information Cards */}
      <div className="px-4 pb-6 space-y-3">
        {/* Restaurant Name Card */}`;

const repl3 = `      {/* Information Cards */}
      <div className="px-4 pb-6 space-y-3">
        {isGroceryStoreRoute ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-blue-100/50 rounded-lg p-4 border border-blue-300"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-base">Store Profile</h3>
                <button
                  onClick={() => navigate("/store/onboarding")}
                  className="text-blue-600 text-sm font-normal hover:text-blue-700 transition-colors ml-4 shrink-0"
                >
                  Edit Profile
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-normal mb-1">Store Name</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {loading ? "Loading..." : (restaurantData?.name || "N/A")}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-normal mb-1">Owner Name</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {loading ? "Loading..." : (restaurantData?.ownerName || "N/A")}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-normal mb-1">Owner Email</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {loading ? "Loading..." : (restaurantData?.ownerEmail || "N/A")}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-normal mb-1">Primary Contact Number</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {loading ? "Loading..." : (restaurantData?.primaryContactNumber || restaurantData?.phone || "N/A")}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-normal mb-1">Address</p>
                  <div className="flex items-start gap-1.5 mt-1">
                    <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-sm font-semibold text-gray-900">
                      {loading ? "Loading..." : (address || "No address provided")}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="space-y-3 pt-2"
            >
              <button
                onClick={() => navigate(isGroceryStoreRoute ? "/store/outlet-timings" : "/restaurant/outlet-timings")}
                className="w-full bg-blue-100/50 rounded-lg p-4 border border-blue-300 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="text-base font-semibold text-gray-900">Outlet Timings</span>
                </div>
                <ChevronRight className="w-5 h-5 text-blue-600" />
              </button>
            </motion.div>
          </>
        ) : (
          <>
        {/* Restaurant Name Card */}`;

const target4 = `            <ChevronRight className="w-5 h-5 text-blue-600" />
          </button>
        </motion.div>
      </div>

      {/* Edit Restaurant Name Dialog */}`;

const repl4 = `            <ChevronRight className="w-5 h-5 text-blue-600" />
          </button>
        </motion.div>
          </>
        )}
      </div>

      {/* Edit Restaurant Name Dialog */}`;

let modifications_made = false;

if (content.includes(target1)) {
    content = content.replace(target1, repl1);
    modifications_made = true;
} else {
    console.log('target1 not found');
}

if (content.includes(target2)) {
    content = content.replace(target2, repl2);
    modifications_made = true;
} else {
    console.log('target2 not found');
}

if (content.includes(target3)) {
    content = content.replace(target3, repl3);
    modifications_made = true;
} else {
    console.log('target3 not found');
}

if (content.includes(target4)) {
    content = content.replace(target4, repl4);
    modifications_made = true;
} else {
    console.log('target4 not found');
}

if (modifications_made) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Updated successfully');
}
