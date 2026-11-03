export default function Link({ href, children, scroll, prefetch, ...rest }: { href: string; children?: any; scroll?: boolean; prefetch?: boolean; [k: string]: any }) {
  void scroll; void prefetch;
  return <a href={href} {...rest}>{children}</a>;
}
