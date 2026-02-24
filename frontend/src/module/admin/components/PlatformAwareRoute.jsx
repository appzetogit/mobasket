import { usePlatform } from "../context/PlatformContext"

/**
 * PlatformAwareRoute - Conditionally renders components based on platform
 * @param {React.Component} mofoodComponent - Component to show for mofood
 * @param {React.Component} mogroceryComponent - Component to show for mogrocery
 */
export default function PlatformAwareRoute({ mofoodComponent: MofoodComponent, mogroceryComponent: MogroceryComponent }) {
  const { platform } = usePlatform()
  
  if (platform === "mogrocery" && MogroceryComponent) {
    return <MogroceryComponent />
  }
  
  return <MofoodComponent />
}
