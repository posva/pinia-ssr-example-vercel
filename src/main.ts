import 'windi.css'
import './styles/main.css'
import viteSSR, { ClientOnly } from 'vite-ssr'
import { createHead } from '@vueuse/head'
import generatedRoutes from 'pages-generated'
import { setupLayouts } from 'layouts-generated'
import App from './App.vue'
import { useCartStore } from './stores'
import { RouteRecordRaw } from 'vue-router'
import { Pinia } from 'pinia'
import devalue from '@nuxt/devalue'

const routes = setupLayouts(generatedRoutes) as RouteRecordRaw[]

// This piece will move route.meta.state to Page props.
// This can be removed if you prefer Vuex instead of Page props.
// routes.forEach((route) => {
//   if (!('redirect' in route)) {
//     route.props = (r) => ({ ...(r.meta.state || {}), ...(r.props || {}) })
//   }
// })

// https://github.com/frandiox/vite-ssr
export default viteSSR(App, { routes }, (ctx) => {
  // install all modules under `modules/`
  Object.values(import.meta.globEager('./modules/*.ts')).map((i) =>
    i.install?.(ctx)
  )

  const { app, url, router, isClient, initialState } = ctx

  const head = createHead()
  app.use(head)

  app.component(ClientOnly.name, ClientOnly)

  const pinia = router.pinia as Pinia

  // Freely modify initialState and it will be serialized later
  if (import.meta.env.SSR) {
    const cart = useCartStore(pinia)
    cart.addItem('Gift from the server')
    initialState.pinia = devalue(pinia.state.value)
    // This object can be passed to Vuex store
  } else {
    // In browser, initialState will be hydrated with data from SSR
    console.log('Initial state:', initialState)
    console.log('pinia', pinia.state.value)
  }

  // As an example, make a getPageProps request before each route navigation
  router.beforeEach(async (to, from, next) => {
    return next()
    if (!!to.meta.state && (!import.meta.env.DEV || import.meta.env.SSR)) {
      // This route has state already (from server) so it can be reused.
      return next()
    }

    // `isClient` here is a handy way to determine if it's SSR or not.
    // However, it is a runtime variable so it won't be tree-shaked.
    // Use Vite's `import.meta.env.SSR` instead for tree-shaking.
    const baseUrl = isClient ? '' : url.origin

    // Explanation:
    // The first rendering happens in the server. Therefore, when this code runs,
    // the server makes a request to itself (running the code below) in order to
    // get the current page props and use that response to render the HTML.
    // The browser shows this HTML and rehydrates the application, turning it into
    // a normal SPA. After that, subsequent route navigation runs this code below
    // from the browser and get the new page props, which is this time rendered
    // directly in the browser, as opposed to the first page rendering.

    try {
      // Get our page props from our custom API:
      const res = await fetch(
        `${baseUrl}/api/get-page-props?path=${encodeURIComponent(
          to.path
        )}&name=${to.name}&client=${isClient}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      // During SSR, this is the same as modifying initialState
      to.meta.state = await res.json()
    } catch (error) {
      console.error(error)
      // redirect to error route conditionally
    }

    next()
  })

  return { head }
})
