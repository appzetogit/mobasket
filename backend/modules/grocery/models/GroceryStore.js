import Restaurant from '../../restaurant/models/Restaurant.js';

const GROCERY_PLATFORM = 'mogrocery';

const withGroceryPlatform = (query = {}) => ({
  ...query,
  platform: GROCERY_PLATFORM
});

const GroceryStore = {
  find(filter = {}, projection = null, options = null) {
    return Restaurant.find(withGroceryPlatform(filter), projection, options);
  },

  findOne(filter = {}, projection = null, options = null) {
    return Restaurant.findOne(withGroceryPlatform(filter), projection, options);
  },

  findById(id, projection = null, options = null) {
    return Restaurant.findOne(withGroceryPlatform({ _id: id }), projection, options);
  },

  findByIdAndUpdate(id, update, options = {}) {
    return Restaurant.findOneAndUpdate(withGroceryPlatform({ _id: id }), update, options);
  },

  findOneAndUpdate(filter = {}, update, options = {}) {
    return Restaurant.findOneAndUpdate(withGroceryPlatform(filter), update, options);
  },

  findOneAndDelete(filter = {}, options = {}) {
    return Restaurant.findOneAndDelete(withGroceryPlatform(filter), options);
  },

  countDocuments(filter = {}) {
    return Restaurant.countDocuments(withGroceryPlatform(filter));
  },

  exists(filter = {}) {
    return Restaurant.exists(withGroceryPlatform(filter));
  },

  create(doc = {}) {
    return Restaurant.create({
      ...doc,
      platform: GROCERY_PLATFORM
    });
  }
};

export { GROCERY_PLATFORM, withGroceryPlatform };
export default GroceryStore;

