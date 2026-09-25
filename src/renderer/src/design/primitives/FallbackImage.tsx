import { type ImgHTMLAttributes, type JSX, type ReactNode, useState } from 'react'

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src: string
  fallback: ReactNode
}

export default function FallbackImage({ src, fallback, ...img }: FallbackImageProps): JSX.Element {
  // Falha guardada pela URL: uma `src` nova (ex.: Catálogo re-sincronizado) tenta de novo sozinha.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (failedSrc === src) return <>{fallback}</>
  return <img src={src} draggable={false} {...img} onError={() => setFailedSrc(src)} />
}
