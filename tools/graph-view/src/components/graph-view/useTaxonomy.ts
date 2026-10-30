// The taxonomy seam for components.
//
// Pure functions take an taxonomy as a parameter; React components read it from
// context, because the alternative is threading one prop through every
// intermediate component that does not otherwise care about it.
//
// **There is no default, deliberately.** It shipped with the domain taxonomy as
// the context default, which meant every consumer resolved correctly whether or
// not anyone supplied one — and the seam looked finished while no provider
// existed anywhere in the tree. A missing provider is a wiring bug that hides
// perfectly: nothing is undefined, nothing throws, the graph renders, and it
// renders the shipped domain's colours no matter which taxonomy the host meant
// to install. So the default is `null` and `useTaxonomy` throws on it.

import React from 'react'
import type { Taxonomy } from '../../graph/taxonomy'

/** The taxonomy for every view and bar below the provider, so a host passes it once. */
export const TaxonomyContext = React.createContext<Taxonomy | null>(null)

/**
 * The taxonomy in scope.
 *
 * Throws when no provider is above the caller. That is the point: a wrong
 * taxonomy is invisible, a missing one should not be.
 */
export function useTaxonomy(): Taxonomy {
  const taxonomy = React.useContext(TaxonomyContext)
  if (taxonomy === null) {
    throw new Error(
      'useTaxonomy() was called with no TaxonomyContext.Provider above it. ' +
      'The graph engine resolves styles, filter keys, spring categories and ' +
      'physics through the taxonomy, so there is no meaningful default — wrap ' +
      'the tree in <TaxonomyContext.Provider value={…}>.',
    )
  }
  return taxonomy
}
