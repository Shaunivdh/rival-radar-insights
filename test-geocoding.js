const API_KEY = 'AIzaSyA23gv9SWKXVsAOTVo3l3uBeOZIcoeK-rI';

fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': API_KEY,
    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
  },
  body: JSON.stringify({ textQuery: 'London' }),
})
  .then(res => res.json())
  .then(data => {
    if (!data.places?.length) {
      console.error('No results returned:', JSON.stringify(data));
      return;
    }
    const place = data.places[0];
    console.log('API key works!');
    console.log('Name:', place.displayName?.text);
    console.log('Formatted address:', place.formattedAddress);
    console.log('Latitude:', place.location?.latitude);
    console.log('Longitude:', place.location?.longitude);
  })
  .catch(err => console.error('Fetch error:', err.message));
