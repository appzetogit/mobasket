import express from 'express';
import {
    getRestaurants,
    getRestaurantBySlug,
    getCategories,
    getLimelight,
    getBankOffers,
    getMustTries,
    getOfferBanners,
    getStories
} from '../controllers/diningController.js';

const router = express.Router();

router.get('/restaurants', getRestaurants);
router.get('/restaurants/:slug', getRestaurantBySlug);
router.get('/categories', getCategories);
router.get('/limelight', getLimelight);
router.get('/bank-offers', getBankOffers);
router.get('/must-tries', getMustTries);
router.get('/offer-banners', getOfferBanners);
router.get('/stories', getStories);

export default router;
