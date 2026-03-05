import express from 'express';
import {
  submitSignupDetails,
  submitSignupDocuments
} from '../controllers/deliverySignupController.js';
import { authenticate } from '../middleware/deliveryAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Signup routes
router.post('/signup/details', validate(Joi.object({
  name: Joi.string().trim().min(2).max(100).pattern(/^[a-zA-Z\s]+$/).messages({
    'string.pattern.base': 'Name should only contain alphabets and spaces'
  }).required(),
  email: Joi.string().email().lowercase().trim().optional().allow(null, ''),
  address: Joi.string().trim().required(),
  city: Joi.string().trim().pattern(/^[a-zA-Z\s]+$/).messages({
    'string.pattern.base': 'City should only contain alphabets and spaces'
  }).required(),
  state: Joi.string().trim().pattern(/^[a-zA-Z\s]+$/).messages({
    'string.pattern.base': 'State should only contain alphabets and spaces'
  }).required(),
  vehicleType: Joi.string().valid('bike', 'scooter', 'bicycle', 'car').required(),
  vehicleName: Joi.string().trim().required().messages({
    'any.required': 'Vehicle name/model is required'
  }),
  vehicleNumber: Joi.string().trim().pattern(/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/).messages({
    'string.pattern.base': 'Invalid vehicle number format (e.g. MH12AB1234)'
  }).required(),
  panNumber: Joi.string().trim().uppercase().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).messages({
    'string.pattern.base': 'Invalid PAN format (e.g. ABCDE1234F)'
  }).required(),
  aadharNumber: Joi.string().trim().length(12).pattern(/^[0-9]+$/).messages({
    'string.pattern.base': 'Aadhar number must be 12 digits'
  }).required()
})), submitSignupDetails);

router.post('/signup/documents', validate(Joi.object({
  profilePhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  aadharPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  panPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  drivingLicensePhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).optional().allow(null),
  drivingLicenseNumber: Joi.string().trim().required()
})), submitSignupDocuments);

export default router;

