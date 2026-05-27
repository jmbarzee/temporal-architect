import { TWFFile } from '../types/ast';
import { ParserGraph } from '../types/parser-graph';
import { Graph } from './model';
export declare function buildGraph(parserGraph: ParserGraph, ast: TWFFile): Graph;
