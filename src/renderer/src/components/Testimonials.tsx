import React from 'react'
import { motion } from 'framer-motion'
import { Star, Quote, CheckCircle2 } from 'lucide-react'

export const Testimonials: React.FC = () => {
  const reviews = [
    {
      quote:
        'IRIS completely replaced my tab hopping. I can speak a complex task like "Inspect the repo and draft a unit test" and it executes while I drink coffee.',
      name: 'Alex Rivera',
      role: 'Staff Systems Architect',
      company: 'Distributed Systems Labs',
      rating: 5
    },
    {
      quote:
        'The continuous speech recognition and instant barge-in makes it feel like having a real research colleague sitting beside me in the lab.',
      name: 'Dr. Elena Rostova',
      role: 'Principal AI Researcher',
      company: 'Neural Compute Institute',
      rating: 5
    },
    {
      quote:
        'The YouTube trend analyzer and automatic script validator gave our video team a 4x throughput boost. Truly an operating layer, not just a chatbot.',
      name: 'Marcus Chen',
      role: 'Head of Content Strategy',
      company: 'Aether Digital Media',
      rating: 5
    }
  ]

  return (
    <section id="testimonials" className="relative py-24 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">
            Social Proof
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Trusted by Builders & Researchers
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            See how developers and teams operate hands-free with IRIS every day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((rev, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="rounded-3xl bg-[#0b0c14] border border-white/[0.08] p-8 flex flex-col justify-between relative hover:border-emerald-500/30 transition-all shadow-lg"
            >
              <Quote className="w-8 h-8 text-emerald-500/20 mb-4" />

              <div className="space-y-4">
                <div className="flex gap-1">
                  {[...Array(rev.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-emerald-400 text-emerald-400" />
                  ))}
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed italic">
                  "{rev.quote}"
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-white/[0.05] flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">{rev.name}</h4>
                  <p className="text-xs text-zinc-400">{rev.role} • {rev.company}</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Testimonials
