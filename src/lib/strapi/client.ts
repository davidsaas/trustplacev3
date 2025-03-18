import qs from 'qs'

const STRAPI_API_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL
const STRAPI_TOKEN = process.env.STRAPI_TOKEN

interface FetchOptions {
  path: string
  urlParamsObject?: Record<string, any>
  options?: RequestInit
}

/**
 * Helper to make GET requests to Strapi API endpoints
 */
export async function fetchAPI<T>({ path, urlParamsObject = {}, options = {} }: FetchOptions): Promise<T> {
  try {
    // Merge default and user options
    const mergedOptions = {
      next: { revalidate: 60 },
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STRAPI_TOKEN}`,
      },
      ...options,
    }

    // Build request URL
    const queryString = qs.stringify(urlParamsObject, {
      encodeValuesOnly: true,
    })
    const requestUrl = `${STRAPI_API_URL}/api${path}${queryString ? `?${queryString}` : ''}`

    // Trigger API call
    const response = await fetch(requestUrl, mergedOptions)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(`An error occurred please try again: ${data.error.message}`)
    }

    return data
  } catch (error) {
    console.error(error)
    throw error
  }
} 