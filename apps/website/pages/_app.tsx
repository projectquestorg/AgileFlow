import type { AppContext, AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

App.getInitialProps = async (_appContext: AppContext) => {
  return { pageProps: {} };
};
