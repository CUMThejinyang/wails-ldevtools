import { ReactElement } from 'react'
import {
  TooltipProvider,
  Tooltip as RadixTooltip,
  TooltipTrigger,
  TooltipContent,
} from './ui/tooltip'

interface Props {
  text: string
  children: ReactElement
  placement?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

export default function Tooltip({ text, children, placement = 'bottom', delay = 400 }: Props) {
  return (
    <TooltipProvider delayDuration={delay} skipDelayDuration={0}>
      <RadixTooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={placement}>{text}</TooltipContent>
      </RadixTooltip>
    </TooltipProvider>
  )
}
