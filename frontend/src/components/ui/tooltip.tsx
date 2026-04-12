import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[9999] overflow-hidden rounded-md px-3.5 py-1.5 text-xs font-medium',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-popover)',
        color: 'var(--color-popover-foreground)',
        border: '0.5px solid var(--color-border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
        maxWidth: 240,
        padding: '.3rem'
      }}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow
        style={{
          fill: 'var(--color-popover)',
          stroke: 'var(--color-border)',
          strokeWidth: 0.5,
        }}
        width={10}
        height={5}
      />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent }
