import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import Admin model
import Admin from '../modules/admin/models/Admin.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const allPermissions = [
    'dashboard_view',
    'admin_manage',
    'restaurant_manage',
    'delivery_manage',
    'order_manage',
    'user_manage',
    'report_view',
    'settings_manage',
    'payment_manage',
    'campaign_manage'
];

const seedAdmin = async () => {
    try {
        const email = 'appzeto@gmail.com';
        const password = '123456';
        const role = 'super_admin';
        const name = 'Appzeto Admin';

        console.log(`Checking if admin user with email "${email}" exists...`);

        // Check if admin already exists
        let admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');

        if (admin) {
            console.log('⚠️  Admin already exists. Updating details...');
            admin.name = name;
            admin.password = password; // pre-save hook will hash this password
            admin.role = role;
            admin.permissions = allPermissions;
            admin.isActive = true;
            await admin.save();
            console.log('✅ Admin updated successfully!');
        } else {
            console.log('Admin does not exist. Creating new admin user...');
            admin = await Admin.create({
                name,
                email,
                password, // pre-save hook will hash this password
                role,
                permissions: allPermissions,
                isActive: true
            });
            console.log('✅ Admin created successfully!');
        }

        console.log('Admin Details:');
        console.log('- ID:', admin._id);
        console.log('- Name:', admin.name);
        console.log('- Email:', admin.email);
        console.log('- Role:', admin.role);
        console.log('- Active:', admin.isActive);
        console.log('- Permissions:', admin.permissions);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding admin:', error.message);
        process.exit(1);
    }
};

// Run the script
connectDB().then(() => {
    seedAdmin();
});
