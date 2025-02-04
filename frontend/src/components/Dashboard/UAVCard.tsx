import {
  Box,
  Flex,
  Image,
  Divider,
  Text,
  VStack,
  Progress,
  Link,
} from "@chakra-ui/react"
import { ConnectionStatusBadge } from "../ui/ConnectionStatusBadge"

import { Link as RouterLink } from "@tanstack/react-router"

import { ConnectionStatus } from "../../enum"

interface UAVCardProps {
  id: number
}

export const UAVCard = ({ id }: UAVCardProps) => {
  return (
    <Box
      p={4}
      m={2}
      w={{ sm: "full", md: "50%", lg: "33%" }}
      border="1px"
      borderColor="gray.200"
      borderRadius={8}
      shadow="md"
    >
      <Flex justify="space-between">
        <Box display="flex" gap={2}>
          <CardThumbnail />
          <Text as="h3" textStyle="h3">
            UAV1
          </Text>
        </Box>
        <ConnectionStatusBadge status={ConnectionStatus.Connected} />
      </Flex>
      <Divider mt={2} />
      <VStack spacing={4} align="stretch">
        <Flex justify="space-between" alignItems="center" h="40px">
          <Text fontSize="md">고도:</Text>
          <Progress colorScheme="green" w="80%" size="lg" value={40} />
        </Flex>
        <Flex justify="space-between" alignItems="center" h="40px">
          <Text fontSize="md">속도:</Text>
          <Progress colorScheme="green" w="80%" size="lg" value={30} />
        </Flex>
        <Flex justify="space-between" alignItems="center" h="40px">
          <Text fontSize="md">배터리:</Text>
          <Progress value={20} size="lg" w="80%" colorScheme="pink" />
        </Flex>
      </VStack>

      <Link
        as={RouterLink}
        to="/uav/$uavId"
        params={{
          uavId: id,
        }}
        color="blue.500"
      >
        상세 보기 {"->"}
      </Link>

      {/* <Link to={UavRoute.path({ params: { uav: "123" } })}>Go to UAV 123</Link> */}
    </Box>
  )
}

interface CardThumbnailProps {
  imageUrl?: string
  width?: string
  height?: string
}

export const CardThumbnail = ({
  imageUrl,
  width = "40px",
  height = "40px",
}: CardThumbnailProps) => {
  return imageUrl ? (
    <Image
      src={imageUrl}
      alt="Card thumbnail"
      objectFit="cover"
      w={width}
      h={height}
      borderRadius="md"
    />
  ) : (
    <svg
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: "0.375rem" }}
    >
      <rect width="100%" height="100%" fill={"gray.200"} />
      <text
        x="50%"
        y="50%"
        dy=".35em"
        textAnchor="middle"
        fontSize={32}
        fill="white"
      >
        {"u".toUpperCase() || "-"}
      </text>
    </svg>
  )
}
