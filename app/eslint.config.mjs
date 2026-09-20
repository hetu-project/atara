import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/*
只开一条规则：rules-of-hooks。

不是懒。这个项目的风格由人和 review 定，一整套 lint 规则铺开只会把一堆
「改了也不会更好」的告警塞进每次提交，然后大家学会忽略它们——而一旦开始忽略，
真正要紧的那条也一起被忽略了。

rules-of-hooks 不一样：它抓的是一类**静态可判定、后果是整页崩掉、而且肉眼极难
发现**的错误。我们就撞过一次——一个 useEffect 排在某个提前返回的后面，平时没事，
只在「交易条款和本版支持的币对不上」那条分支上才少跑一个 hook，于是 React 抛
"Rendered fewer hooks than expected"，控制台白屏。翻了一遍文件没找到，写了两版
正则也没找到，装上这条规则一秒钟就指出来了。

要加别的规则随时可以加，但加之前先问一句：它抓的错误，值得让所有人每次都看一眼吗。
*/
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  {
    /* 代码里那些 `eslint-disable-next-line react-hooks/exhaustive-deps` 是写给人
       看的：它们说明「这个依赖是我故意不写的」，而理由就在旁边的注释里。我们
       没开 exhaustive-deps，所以 eslint 会说它们「没在用」——那是七行每次构建
       都要滚过去的噪音，而噪音多了，真正要紧的那一条就会被一起略过。 */
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
]
