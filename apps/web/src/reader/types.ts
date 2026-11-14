import type { Source } from '../ui/atoms';

export interface Watch {
  name: string;
  kind: string;
  where: string;
  count: number;
  last: string;
}

export interface Match {
  watch: string;
  src: Source;
  title: string;
  age: string;
}

export interface Digest {
  title: string;
  lead: string;
  sections: { head: string; text: string; items: { src: Source; title: string }[] }[];
}
