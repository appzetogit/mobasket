import {
  getWallet as getRestaurantWallet,
  getWalletTransactions as getRestaurantWalletTransactions,
  getWalletStats as getRestaurantWalletStats,
} from '../../restaurant/controllers/restaurantWalletController.js';
import {
  createWithdrawalRequest as createRestaurantWithdrawalRequest,
  getRestaurantWithdrawalRequests as getRestaurantWithdrawalRequests,
} from '../../restaurant/controllers/withdrawalController.js';

const attachStoreAsRestaurant = (req) => {
  req.restaurant = req.store;
};

export const getWallet = async (req, res) => {
  attachStoreAsRestaurant(req);
  return getRestaurantWallet(req, res);
};

export const getWalletTransactions = async (req, res) => {
  attachStoreAsRestaurant(req);
  return getRestaurantWalletTransactions(req, res);
};

export const getWalletStats = async (req, res) => {
  attachStoreAsRestaurant(req);
  return getRestaurantWalletStats(req, res);
};

export const createWithdrawalRequest = async (req, res) => {
  attachStoreAsRestaurant(req);
  return createRestaurantWithdrawalRequest(req, res);
};

export const getWithdrawalRequests = async (req, res) => {
  attachStoreAsRestaurant(req);
  return getRestaurantWithdrawalRequests(req, res);
};

