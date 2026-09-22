/** Recorded-shape SerpApi google_maps response (trimmed). */
export const serpLocalResponse = {
  search_metadata: { status: 'Success' },
  local_results: [
    { position: 1, title: 'Bristol Plumbing Co', website: 'https://bristolplumbing.test/' },
    { position: 2, title: 'Acme Plumbing', links: { website: 'https://www.acme-plumbing.test/' } },
    { position: 3, title: 'Pipes R Us', website: 'https://pipesrus.test/' },
  ],
  ads: [{ title: 'Sponsored plumber' }],
};

export const serpEmptyResponse = { search_metadata: { status: 'Success' }, local_results: [] };
export const serpErrorResponse = { error: "Google hasn't returned any results for this query." };
