const fs = require('fs');
const path = 'c:/Users/Ishaa/Desktop/CompanyProjects/mobasket/frontend/src/module/user/pages/orders/OrderTracking.jsx';
let content = fs.readFileSync(path, 'utf8');

// Using \s+ to be very flexible with whitespace and line endings
const search = /<motion\.button\s+className="w-10\s+h-10\s+flex\s+items-center\s+justify-center"\s+whileTap=\{\{\s+scale:\s+0\.9\s+\}\}\s+>\s+<Share2\s+className="w-5\s+h-5"\s+\/>\s+<\/motion\.button>/;

const replace = '<div className="w-10 h-10" />';

if (search.test(content)) {
    const newContent = content.replace(search, replace);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log("SUCCESS: Replaced share button");
} else {
    console.error("ERROR: Could not find share button pattern even with flexible regex");
}
