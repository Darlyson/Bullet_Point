import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTopics } from '../components/topics'
import { TopicFilterContext } from './context'

/**
 * Filtro global por tópico: escolher um tópico filtra todas as janelas
 * (hábitos, diário, notas, foco, hoje, gráficos). Fica salvo, então continua
 * ativo ao reabrir o app. Use com `useTopicFilter()` e `inTopic()` (context.ts).
 */

const KEY = 'bp-topic-filter'

export function TopicFilterProvider({ children }: { children: ReactNode }) {
  const [topicId, setTopicId] = useState(() => localStorage.getItem(KEY) ?? '')
  const { byId, loaded } = useTopics()

  // O tópico filtrado foi excluído: volta a mostrar tudo.
  const effective = loaded && topicId !== '' && !byId.has(topicId) ? '' : topicId

  useEffect(() => {
    localStorage.setItem(KEY, effective)
  }, [effective])

  const toggle = useCallback((id: string) => setTopicId((cur) => (cur === id ? '' : id)), [])
  const value = useMemo(() => ({ topicId: effective, setTopicId, toggle }), [effective, toggle])
  return <TopicFilterContext.Provider value={value}>{children}</TopicFilterContext.Provider>
}
