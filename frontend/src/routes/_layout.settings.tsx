// import {
//   Container,
//   Heading,
//   Tab,
//   TabList,
//   TabPanel,
//   TabPanels,
//   Tabs,
// } from "@chakra-ui/react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import type { UserPublic } from "../client"
import Appearance from "../components/UserSettings/Appearance"
import ChangePassword from "../components/UserSettings/ChangePassword"
import DeleteAccount from "../components/UserSettings/DeleteAccount"
import UserInformation from "../components/UserSettings/UserInformation"
import { Typography } from "@/components/Common/Typography"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

const tabsConfig = [
  { title: "My profile", component: UserInformation },
  { title: "Password", component: ChangePassword },
  { title: "Appearance", component: Appearance },
  { title: "Danger zone", component: DeleteAccount },
]

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
})

function UserSettings() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const finalTabs = currentUser?.is_superuser
    ? tabsConfig.slice(0, 3)
    : tabsConfig

  return (
    <DashboardBackground variant="settings">
      <div className="container">
        <div className="m-4 pt-12">
          <Typography variant="h2">사용자 설정</Typography>
          <Tabs defaultValue="account" className="mt-6 w-[400px]">
            <TabsList>
              {finalTabs.map((tab, index) => (
                <TabsTrigger key={`${tab.title}${index}`} value={tab.title}>
                  {tab.title}
                </TabsTrigger>
              ))}
            </TabsList>
            {finalTabs.map((tab, index) => (
              <TabsContent key={index} value={tab.title}>
                <tab.component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </DashboardBackground>
  )

    // <div maxW="full">
    //   <h2 size="lg" textAlign={{ base: "center", md: "left" }} py={12}>
    //     User Settings
    //   </h2>
    //   <Tabs variant="enclosed">
    //     <TabList>
    //       {finalTabs.map((tab, index) => (
    //         <Tab key={index}>{tab.title}</Tab>
    //       ))}
    //     </TabList>
    //     <TabPanels>
    //       {finalTabs.map((tab, index) => (
    //         <TabPanel key={index}>
    //           <tab.component />
    //         </TabPanel>
    //       ))}
    //     </TabPanels>
    //   </Tabs>
    // </div>
  )
}
