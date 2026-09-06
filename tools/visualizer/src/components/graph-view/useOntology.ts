// The taxonomy seam for components.
//
// Pure functions take an ontology as a parameter; React components read it from
// context, because the alternative is threading one prop through every
// intermediate component that does not otherwise care about it.
//
// The context default is the shipped taxonomy, so nothing needs a provider to
// keep working. That is deliberate for now and temporary: it is what lets the
// seam land without touching a single render tree, and the default disappears
// when the entries move out of the library.

import React from 'react'
import { DEFAULT_ONTOLOGY } from '../../graph/node-types'
import type { Ontology } from '../../graph/ontology'

export const OntologyContext = React.createContext<Ontology>(DEFAULT_ONTOLOGY)

/** The taxonomy in scope. */
export function useOntology(): Ontology {
  return React.useContext(OntologyContext)
}
