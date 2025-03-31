import { Suspense } from 'react'
import { URLProcessor } from '@/app/safety-report/components/URLProcessor'
import { Container } from '@/components/landing/Container'

export default function Home() {
  return (
    <>
      <main className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-20 sm:py-32">
        <Container>
          <Suspense fallback={null}>
            <URLProcessor />
          </Suspense>
        </Container>
      </main>
    </>
  )
}
