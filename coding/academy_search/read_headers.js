import fs from 'fs';
const data = fs.readFileSync('c:/Users/bro33/coding/academy_search/src/test_data.csv', 'utf8');
const firstLine = data.split('\n')[0];
const headers = firstLine.split(',');
headers.forEach((h, i) => console.log(`${i}: ${h.trim()}`));
