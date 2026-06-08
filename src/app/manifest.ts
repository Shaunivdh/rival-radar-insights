import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Scoutly',
    short_name: 'Scoutly',
    description: 'Local competitor intelligence tool',
    start_url: '/',
    display: 'standalone',
    background_color: '#EAEBF0',
    theme_color: '#5B4EE8',
    icons: [{ src: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }],
  };
}
