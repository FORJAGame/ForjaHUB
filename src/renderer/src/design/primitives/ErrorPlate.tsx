import { useEffect, useState, type JSX } from 'react'

interface ErrorPlateProps {
  message: string
}

export default function ErrorPlate({ message }: ErrorPlateProps): JSX.Element {
  const [risen, setRisen] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRisen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-6 pb-6"
    >
      <div
        className={`text-error-plate pointer-events-auto border-l-[3px] border-action bg-surface-raised px-4 py-3 text-ink-primary transition-transform duration-300 ease-out ${
          risen ? 'translate-y-0' : 'translate-y-[120%]'
        }`}
      >
        {message}
      </div>
    </div>
  )
}
