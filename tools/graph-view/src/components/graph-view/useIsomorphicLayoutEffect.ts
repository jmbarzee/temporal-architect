// A layout effect where there is a layout: on a server render there is none,
// and React says so on the console for every `useLayoutEffect` it meets.

import React from 'react'

export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect
