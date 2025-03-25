import Image from 'next/image'

export function Logo(props: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div {...props}>
      <Image 
        src="/logo.svg" 
        alt="Trustplace" 
        width={124} 
        height={25} 
        priority
      />
    </div>
  )
}
 