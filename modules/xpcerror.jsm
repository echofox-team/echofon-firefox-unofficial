
var EXPORTED_SYMBOLS = ["stringForXPCError"];

var XPCErrors = {};

XPCErrors[Components.results.NS_BINDING_FAILED                       ] = "The async request failed for some unknown reason";
XPCErrors[Components.results.NS_BINDING_ABORTED                      ] = "The async request failed because it was aborted by some user action";
XPCErrors[Components.results.NS_BINDING_REDIRECTED                   ] = "The async request has been redirected to a different async request";
XPCErrors[Components.results.NS_BINDING_RETARGETED                   ] = "The async request has been retargeted to a different handler";
XPCErrors[Components.results.NS_ERROR_MALFORMED_URI                  ] = "The URI is malformed";
XPCErrors[Components.results.NS_ERROR_UNKNOWN_PROTOCOL               ] = "The URI scheme corresponds to an unknown protocol handler";
XPCErrors[Components.results.NS_ERROR_NO_CONTENT                     ] = "Channel opened successfully but no data will be returned";
XPCErrors[Components.results.NS_ERROR_IN_PROGRESS                    ] = "The requested action could not be completed while the object is busy";
XPCErrors[Components.results.NS_ERROR_ALREADY_OPENED                 ] = "Channel is already open";
XPCErrors[Components.results.NS_ERROR_INVALID_CONTENT_ENCODING       ] = "The content encoding of the source document is incorrect";
XPCErrors[Components.results.NS_ERROR_ALREADY_CONNECTED              ] = "The connection is already established";
XPCErrors[Components.results.NS_ERROR_NOT_CONNECTED                  ] = "The connection does not exist";
XPCErrors[Components.results.NS_ERROR_CONNECTION_REFUSED             ] = "The connection was refused";
XPCErrors[Components.results.NS_ERROR_PROXY_CONNECTION_REFUSED       ] = "The connection to the proxy server was refused";
XPCErrors[Components.results.NS_ERROR_NET_TIMEOUT                    ] = "The connection has timed out";
XPCErrors[Components.results.NS_ERROR_OFFLINE                        ] = "The requested action could not be completed in the offline state";
XPCErrors[Components.results.NS_ERROR_PORT_ACCESS_NOT_ALLOWED        ] = "Establishing a connection to an unsafe or otherwise banned port was prohibited";
XPCErrors[Components.results.NS_ERROR_NET_RESET                      ] = "The connection was established: but no data was ever received";
XPCErrors[Components.results.NS_ERROR_NET_INTERRUPT                  ] = "The connection was established: but the data transfer was interrupted";
XPCErrors[Components.results.NS_ERROR_NOT_RESUMABLE                  ] = "This request is not resumable: but it was tried to resume it: or to request resume-specific data";
XPCErrors[Components.results.NS_ERROR_ENTITY_CHANGED                 ] = "It was attempted to resume the request: but the entity has changed in the meantime";
XPCErrors[Components.results.NS_ERROR_REDIRECT_LOOP                  ] = "The request failed as a result of a detected redirection loop";
XPCErrors[Components.results.NS_ERROR_UNSAFE_CONTENT_TYPE            ] = "The request failed because the content type returned by the server was not a type expected by the channel";
XPCErrors[Components.results.NS_ERROR_FTP_LOGIN                      ] = "FTP error while logging in";
XPCErrors[Components.results.NS_ERROR_FTP_CWD                        ] = "FTP error while changing directory";
XPCErrors[Components.results.NS_ERROR_FTP_PASV                       ] = "FTP error while changing to passive mode";
XPCErrors[Components.results.NS_ERROR_FTP_PWD                        ] = "FTP error while retrieving current directory";
XPCErrors[Components.results.NS_ERROR_FTP_LIST                       ] = "FTP error while retrieving a directory listing";
XPCErrors[Components.results.NS_ERROR_UNKNOWN_HOST                   ] = "The lookup of the hostname failed";
XPCErrors[Components.results.NS_ERROR_UNKNOWN_PROXY_HOST             ] = "The lookup of the proxy hostname failed";
XPCErrors[Components.results.NS_ERROR_UNKNOWN_SOCKET_TYPE            ] = "The specified socket type does not exist";
XPCErrors[Components.results.NS_ERROR_SOCKET_CREATE_FAILED           ] = "The specified socket type could not be created";
XPCErrors[Components.results.NS_ERROR_CACHE_KEY_NOT_FOUND            ] = "Cache key could not be found";
XPCErrors[Components.results.NS_ERROR_CACHE_DATA_IS_STREAM           ] = "Cache data is a stream";
XPCErrors[Components.results.NS_ERROR_CACHE_DATA_IS_NOT_STREAM       ] = "Cache data is not a stream";
XPCErrors[Components.results.NS_ERROR_CACHE_WAIT_FOR_VALIDATION      ] = "Cache entry exists but needs to be validated first";
XPCErrors[Components.results.NS_ERROR_CACHE_ENTRY_DOOMED             ] = "Cache entry has been  doomed";
XPCErrors[Components.results.NS_ERROR_CACHE_READ_ACCESS_DENIED       ] = "Read access to cache denied";
XPCErrors[Components.results.NS_ERROR_CACHE_WRITE_ACCESS_DENIED      ] = "Write access to cache denied";
XPCErrors[Components.results.NS_ERROR_CACHE_IN_USE                   ] = "Cache is currently in use";
XPCErrors[Components.results.NS_ERROR_DOCUMENT_NOT_CACHED            ] = "Document does not exist in cache";
XPCErrors[Components.results.NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS     ] = "The requested number of domain levels exceeds those present in the host string";
XPCErrors[Components.results.NS_ERROR_HOST_IS_IP_ADDRESS             ] = "The host string is an IP address";


function stringForXPCError(status)
{
  if (XPCErrors[status]) {
    return XPCErrors[status] + "- code: " + status;
  }
  else {
    return "Unknown Error - code: " + status;
  }
}