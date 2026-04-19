const https = require('https');

function getUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const content = await getUrl('https://raw.githubusercontent.com/LostCityRS/Content/244/src/scripts/items/obj.pack');
  // Just log first 100 lines to see structure
  console.log(content.split('\n').slice(0, 100).join('\n'));
}

main();
