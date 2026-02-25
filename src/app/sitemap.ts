import { prisma } from '@/lib/db'
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://avoidxray.com'

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/films`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/cameras`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  // Get all film stocks - these are valuable for SEO (people search for film stock samples)
  const filmStocks = await prisma.filmStock.findMany({
    select: { id: true },
  })

  const filmPages: MetadataRoute.Sitemap = filmStocks.map((film) => ({
    url: `${baseUrl}/films/${film.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Get all cameras - valuable for SEO (people search for camera sample photos)
  const cameras = await prisma.camera.findMany({
    select: { id: true },
  })

  const cameraPages: MetadataRoute.Sitemap = cameras.map((camera) => ({
    url: `${baseUrl}/cameras/${camera.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Get all users with published photos - photographer profiles
  const users = await prisma.user.findMany({
    where: {
      photos: { some: { published: true } },
    },
    select: { username: true, createdAt: true },
  })

  const userPages: MetadataRoute.Sitemap = users.map((user) => ({
    url: `${baseUrl}/${user.username}`,
    lastModified: user.createdAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Note: Individual photos are NOT included in sitemap
  // They don't provide search value - people search for film/camera samples, not random photos

  return [...staticPages, ...filmPages, ...cameraPages, ...userPages]
}
