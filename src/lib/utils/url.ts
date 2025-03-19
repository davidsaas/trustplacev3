export type AccommodationSource = 'airbnb' | 'booking'

export type ParsedAccommodationURL = {
  source: AccommodationSource
  externalId: string
} | null

export const parseAccommodationURL = (url: string): ParsedAccommodationURL => {
  try {
    const urlObj = new URL(url)
    
    // Airbnb URL pattern: https://www.airbnb.com/rooms/950928010848620401?locale=en-US&...
    if (urlObj.hostname.includes('airbnb')) {
      const pathParts = urlObj.pathname.split('/')
      const roomId = pathParts.find((part, index) => pathParts[index - 1] === 'rooms')
      
      if (roomId) {
        return {
          source: 'airbnb',
          externalId: roomId
        }
      }
    }

    // Booking.com URL pattern: https://www.booking.com/hotel/us/downtown-los-angeles-condo-with-shared-rooftop-pool.en-gb.html
    if (urlObj.hostname.includes('booking.com')) {
      const pathParts = urlObj.pathname.split('/')
      // Find the part that ends with .html and remove the language code and .html
      const hotelPart = pathParts[pathParts.length - 1]
      if (hotelPart) {
        // Remove .en-gb.html or similar language codes and extension
        const externalId = hotelPart.replace(/\.[a-z-]+\.html$/, '')
        
        return {
          source: 'booking',
          externalId
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error parsing URL:', error)
    return null
  }
}