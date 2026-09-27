import * as React from 'react'
import { cn } from '@/lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

interface AvatarContextValue {
  imageLoaded: boolean
  setImageLoaded: React.Dispatch<React.SetStateAction<boolean>>
  hasImage: boolean
  setHasImage: React.Dispatch<React.SetStateAction<boolean>>
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null)

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, children, ...props }, ref) => {
    const [imageLoaded, setImageLoaded] = React.useState(false)
    const [hasImage, setHasImage] = React.useState(false)

    return (
      <AvatarContext.Provider
        value={{ imageLoaded, setImageLoaded, hasImage, setHasImage }}
      >
        <div
          ref={ref}
          className={cn(
            'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-zinc-900 shadow-sm',
            className
          )}
          {...props}
        >
          {children}
        </div>
      </AvatarContext.Provider>
    )
  }
)
Avatar.displayName = 'Avatar'

export interface AvatarImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  onLoadingStatusChange?: (status: 'loading' | 'loaded' | 'error') => void
}

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, src, alt = '', onError, onLoad, ...props }, ref) => {
    const context = React.useContext(AvatarContext)

    React.useEffect(() => {
      if (src && context) {
        context.setHasImage(true)
      }
    }, [src, context])

    if (!src) return null

    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={(e) => {
          context?.setImageLoaded(true)
          onLoad?.(e)
        }}
        onError={(e) => {
          context?.setImageLoaded(false)
          context?.setHasImage(false)
          onError?.(e)
        }}
        className={cn(
          'aspect-square h-full w-full object-cover transition-opacity duration-300',
          context && !context.imageLoaded ? 'opacity-0' : 'opacity-100',
          className
        )}
        {...props}
      />
    )
  }
)
AvatarImage.displayName = 'AvatarImage'

export interface AvatarFallbackProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  AvatarFallbackProps
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(AvatarContext)

  if (context?.imageLoaded) {
    return null
  }

  return (
    <div
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold uppercase text-zinc-200 select-none',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
AvatarFallback.displayName = 'AvatarFallback'
