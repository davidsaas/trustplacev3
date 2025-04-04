'use client'

import { Fragment, type ReactNode } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition } from '@headlessui/react'

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  icon?: ReactNode; // Make icon optional
  iconBgColor?: string; // Make icon background optional
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  icon,
  iconBgColor = 'bg-gray-100' // Default background color
}: ModalProps) {
  return (
    // Use Transition component for smooth enter/leave animations
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-gray-500/75 transition-opacity" />
        </Transition.Child>

        {/* Modal Panel */}
        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div>
                  {icon && (
                    <div className={`mx-auto flex size-12 items-center justify-center rounded-full ${iconBgColor}`}>
                      {icon}
                    </div>
                  )}
                  <div className={`mt-3 text-center ${icon ? 'sm:mt-5' : ''}`}>
                    <DialogTitle as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                      {title}
                    </DialogTitle>
                    {/* Render children passed to the component */}
                    <div className="mt-2">
                      {children}
                    </div>
                  </div>
                </div>
                {/* Optional: Add a default close button if needed, or let children handle actions */}
                {/* <div className="mt-5 sm:mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    Close
                  </button>
                </div> */}
              </DialogPanel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
