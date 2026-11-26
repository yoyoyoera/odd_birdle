// One motif per daily challenge key (see daily.js). Each file exports drawMotif(ctx, options).
import { drawMotif as windy } from './windy.js';
import { drawMotif as sudden } from './sudden.js';
import { drawMotif as smash } from './smash.js';
import { drawMotif as five } from './five.js';
import { drawMotif as post } from './post.js';
import { drawMotif as net } from './net.js';
import { drawMotif as shrink } from './shrink.js';
import { drawMotif as nowarning } from './nowarning.js';

export const motifs = { windy, sudden, smash, five, post, net, shrink, nowarning };
