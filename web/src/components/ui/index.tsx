import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Check, ChevronDown, X } from 'lucide-react';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export { DatePicker } from './date-picker';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', {variants: {variant: {default: 'bg-primary text-primary-foreground hover:bg-primary/90', outline: 'border border-input bg-background hover:bg-accent', ghost: 'hover:bg-accent', destructive: 'bg-destructive text-white hover:bg-destructive/90'}, size: {default: 'h-10 px-4 py-2', sm: 'h-8 px-3 text-xs', icon: 'h-8 w-8'}}, defaultVariants: {variant: 'default', size: 'default'}});
export function Button({className, variant, size, asChild = false, ...props}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & {asChild?: boolean}) { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(buttonVariants({variant, size, className}))} {...props}/>; }
export function Input({className, ...props}: React.ComponentProps<'input'>) { return <input className={cn('flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', className)} {...props}/>; }
export function Textarea({className, ...props}: React.ComponentProps<'textarea'>) { return <textarea className={cn('flex min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props}/>; }
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({children, className, ...props}: React.ComponentProps<typeof DialogPrimitive.Content>) { return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"/><DialogPrimitive.Content className={cn('dialog-panel fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-2xl border bg-background p-6 shadow-xl max-h-[90dvh] overflow-auto', className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 opacity-60 hover:opacity-100 focus-visible:ring-2" aria-label="Kapat"><X size={18}/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }

export type SelectOption = {value: string | number; label: string};
/**
 * Native <select> yerine tema ile birlikte boyanan açılır liste.
 * `name` verilirse Radix gizli input üretir, böylece FormData ile çalışır.
 */
export function Select({options, placeholder = 'Seçin', className, ...props}: React.ComponentProps<typeof SelectPrimitive.Root> & {options: SelectOption[]; placeholder?: string; className?: string}) {
  return <SelectPrimitive.Root {...props}>
    <SelectPrimitive.Trigger className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[placeholder]:text-muted-foreground', className)}>
      <span className="truncate text-left"><SelectPrimitive.Value placeholder={placeholder}/></span>
      <SelectPrimitive.Icon className="shrink-0 opacity-60"><ChevronDown size={16}/></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={6} className="z-[60] max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-input bg-background shadow-xl">
        <SelectPrimitive.Viewport className="p-1">
          {options.map(option => <SelectPrimitive.Item key={option.value} value={String(option.value)}
            className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[state=checked]:font-medium">
            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator className="text-primary"><Check size={14}/></SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
