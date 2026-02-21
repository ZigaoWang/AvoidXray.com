import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ItemDetailSkeleton from '@/components/ItemDetailSkeleton'

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full py-8 md:py-16 px-4 md:px-6">
        <div className="h-6 w-32 bg-neutral-800 animate-pulse mb-6"></div>
        <ItemDetailSkeleton />
      </main>
      <Footer />
    </div>
  )
}
