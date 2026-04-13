import { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  value: number
  duration?: number
  prefix?: string
  decimals?: number
  className?: string
}

export function AnimatedCounter({ value, duration = 800, prefix = '', decimals = 2, className }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef(0)
  const startTimeRef = useRef<number | null>(null)
  const rafRef = useRef<number>()

  useEffect(() => {
    startRef.current = display
    startTimeRef.current = null
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1)
      setDisplay(startRef.current + (value - startRef.current) * easeOut(progress))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value])

  const formatted = prefix + display.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return <span className={className}>{formatted}</span>
}

export default AnimatedCounter
