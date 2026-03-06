const fs = require('fs');
const path = 'c:/Users/Ishaa/Desktop/CompanyProjects/mobasket/frontend/src/module/user/pages/orders/OrderTracking.jsx';
let content = fs.readFileSync(path, 'utf8');

// Match Share2 followed by a comma and whitespace
const search = /Share2,\s*/;

if (search.test(content)) {
    const newContent = content.replace(search, '');
    fs.writeFileSync(path, newContent, 'utf8');
    console.log("SUCCESS: Removed Share2 import");
} else {
    // Try without comma just in case
    const searchNoComma = /Share2/;
    if (searchNoComma.test(content)) {
        const newContent = content.replace(searchNoComma, '');
        fs.writeFileSync(path, newContent, 'utf8');
        console.log("SUCCESS: Removed Share2 import (no comma variant)");
    } else {
        console.error("ERROR: Could not find Share2 import");
    }
}
