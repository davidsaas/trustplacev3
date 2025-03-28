'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { useAccommodationsSaved } from '@/hooks/use-accommodations-saved'
import { motion, AnimatePresence } from 'framer-motion'

interface SavedButtonProps {
  accommodationId: string
  accommodationName: string
  source: string
}

export const SavedButton = ({ 
  accommodationId, 
  accommodationName, 
  source 
}: SavedButtonProps) => {
  const { saveAccommodation, isAccommodationSaved, loading } = useAccommodationsSaved()
  const [isSaving, setIsSaving] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [popupMessage, setPopupMessage] = useState('')
  
  const saved = isAccommodationSaved(accommodationId)

  const handleSaveClick = async () => {
    if (isSaving || loading) return
    
    setIsSaving(true)
    const message = saved ? "Removed from saved" : "Added to saved"
    
    const result = await saveAccommodation(accommodationId, accommodationName, source)
    setIsSaving(false)
    
    if (result.success) {
      setPopupMessage(message)
      setShowPopup(true)
      setTimeout(() => setShowPopup(false), 1500)
    }
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: -40, scale: 1 }}
            exit={{ opacity: 0, y: -60, scale: 0.8 }}
            className="absolute z-10 bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white rounded-full px-3 py-1 shadow-lg text-xs whitespace-nowrap"
          >
            <span className="font-medium text-gray-800">
              {popupMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.button 
        onClick={handleSaveClick}
        disabled={isSaving || loading}
        aria-label={saved ? "Remove from saved accommodations" : "Save accommodation"}
        className={`p-2 rounded-full transition-colors flex items-center justify-center ${
          saved 
            ? "bg-red-50 text-red-500 hover:bg-red-100" 
            : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-red-500"
        } ${(isSaving || loading) ? "opacity-50 cursor-not-allowed" : ""}`}
        whileTap={{ scale: 0.85 }}
        whileHover={!isSaving && !loading ? { scale: 1.1 } : {}}
      >
        <motion.div
          animate={saved ? {
            scale: [1, 1.3, 1],
            transition: { duration: 0.3 }
          } : { scale: 1 }}
        >
          <Heart 
            className={`w-5 h-5 transition-colors ${saved ? "fill-red-500" : "fill-transparent"} ${isSaving ? "animate-pulse" : ""}`} 
          />
        </motion.div>
      </motion.button>
    </div>
  )
} 