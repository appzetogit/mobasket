import DiningRestaurant from '../models/DiningRestaurant.js';
import DiningCategory from '../models/DiningCategory.js';
import DiningLimelight from '../models/DiningLimelight.js';
import DiningBankOffer from '../models/DiningBankOffer.js';
import DiningMustTry from '../models/DiningMustTry.js';
import DiningOfferBanner from '../models/DiningOfferBanner.js';
import DiningStory from '../models/DiningStory.js';

// Get all dining restaurants (with filtering)
export const getRestaurants = async (req, res) => {
    try {
        const { city } = req.query;
        let query = {};

        // Simple filter support
        if (city) {
            query.location = { $regex: city, $options: 'i' };
        }

        const restaurants = await DiningRestaurant.find(query);
        res.status(200).json({
            success: true,
            count: restaurants.length,
            data: restaurants
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get single restaurant by slug
export const getRestaurantBySlug = async (req, res) => {
    try {
        const restaurant = await DiningRestaurant.findOne({ slug: req.params.slug });

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message: 'Restaurant not found'
            });
        }

        res.status(200).json({
            success: true,
            data: restaurant
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get dining categories
export const getCategories = async (req, res) => {
    try {
        const categories = await DiningCategory.find({ isActive: true }).sort({ order: 1 });
        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get limelight features
export const getLimelight = async (req, res) => {
    try {
        const limelights = await DiningLimelight.find({ isActive: true }).sort({ order: 1 });
        res.status(200).json({
            success: true,
            count: limelights.length,
            data: limelights
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get bank offers
export const getBankOffers = async (req, res) => {
    try {
        const offers = await DiningBankOffer.find({ isActive: true });
        res.status(200).json({
            success: true,
            count: offers.length,
            data: offers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get must tries
export const getMustTries = async (req, res) => {
    try {
        const mustTries = await DiningMustTry.find({ isActive: true }).sort({ order: 1 });
        res.status(200).json({
            success: true,
            count: mustTries.length,
            data: mustTries
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get offer banners
export const getOfferBanners = async (req, res) => {
    try {
        const banners = await DiningOfferBanner.find({ isActive: true }).populate('restaurant', 'name').sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: banners.length,
            data: banners
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get dining stories
export const getStories = async (req, res) => {
    try {
        const stories = await DiningStory.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: stories.length,
            data: stories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
