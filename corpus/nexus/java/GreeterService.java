package nexus;

import io.nexusrpc.Operation;
import io.nexusrpc.Service;

/** The service name defaults to the interface's simple name; an operation's to its method name, so each sets the .twf name. */
@Service
public interface GreeterService {
  String ENDPOINT = "GreeterEndpoint";

  @Operation(name = "Hello")
  String hello(String name);

  @Operation(name = "Greet")
  String greet(String name);
}
