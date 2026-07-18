import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = "https://fluina.focalrina.com"

    return [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.5,
        },
        {
            url: `${baseUrl}/ask`,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 1,
        },
    ]
}